const {
  applyTasksScope,
  applyInsightsScope,
  scopedRowData,
} = require("./data-scope");
const { uploadFile, getOrganizationFolderId } = require("./google-drive");

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
  };
}

function toCSV(rows) {
  if (!rows?.length) return "id,content,tags,created_at\n";
  const header = "id,content,tags,created_at";
  const lines = rows.map((r) => {
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [escape(r.id), escape(r.content), escape(r.tags ?? ""), escape(r.created_at)].join(",");
  });
  return [header, ...lines].join("\n");
}

function scopedFindTasks(supabase, ctx) {
  let q = supabase.from("tasks").select("id, title, line_user_id, org_unit_id");
  return applyTasksScope(q, ctx);
}

async function executeTool(supabase, name, args, ctx) {
  if (name === "add_task") {
    const validPriorities = ["高", "中", "低"];
    const priority = validPriorities.includes(args.priority) ? args.priority : "中";
    const row = scopedRowData(ctx, {
      title: args.title,
      due_date: args.due_date || null,
      priority,
      client_company_id: args.client_company_id || null,
      job_seeker_id: args.job_seeker_id || null,
    });
    const { error } = await supabase.from("tasks").insert(row);
    if (error) throw error;
    return { success: true, title: args.title, due_date: args.due_date, priority };
  }

  if (name === "list_tasks") {
    const today = new Date().toISOString().split("T")[0];
    const week = getWeekRange();
    let query = supabase
      .from("tasks")
      .select("id, title, due_date, completed, priority")
      .order("due_date", { ascending: true, nullsFirst: false });

    query = applyTasksScope(query, ctx);

    if (args.filter === "this_week") {
      query = query.gte("due_date", week.start).lte("due_date", week.end);
    } else if (args.filter === "today") {
      query = query.eq("due_date", today);
    } else if (args.filter === "incomplete") {
      query = query.or("completed.eq.false,completed.is.null");
    }

    const { data, error } = await query;
    if (error) throw error;
    return { tasks: data || [] };
  }

  if (name === "complete_task") {
    let query = scopedFindTasks(supabase, ctx)
      .ilike("title", `%${args.title}%`)
      .or("completed.eq.false,completed.is.null")
      .limit(1);
    const { data: tasks, error: findError } = await query;
    if (findError) throw findError;
    if (!tasks?.length) {
      return { success: false, message: "未完了のタスクが見つかりませんでした" };
    }
    const updateData = { completed: true };
    if (args.result) updateData.result = args.result;
    const { error } = await supabase.from("tasks").update(updateData).eq("id", tasks[0].id);
    if (error) throw error;
    return { success: true, title: tasks[0].title, result: args.result || null };
  }

  if (name === "delete_task") {
    let query = scopedFindTasks(supabase, ctx).ilike("title", `%${args.title}%`).limit(1);
    const { data: tasks, error: findError } = await query;
    if (findError) throw findError;
    if (!tasks?.length) return { success: false, message: "タスクが見つかりませんでした" };
    const { error } = await supabase.from("tasks").delete().eq("id", tasks[0].id);
    if (error) throw error;
    return { success: true, title: tasks[0].title };
  }

  if (name === "update_task") {
    let query = scopedFindTasks(supabase, ctx).ilike("title", `%${args.title}%`).limit(1);
    const { data: tasks, error: findError } = await query;
    if (findError) throw findError;
    if (!tasks?.length) return { success: false, message: "タスクが見つかりませんでした" };
    const updateData = {};
    if (args.priority) {
      const validPriorities = ["高", "中", "低"];
      if (validPriorities.includes(args.priority)) updateData.priority = args.priority;
    }
    if (args.due_date !== undefined) {
      updateData.due_date = args.due_date === "null" ? null : args.due_date;
    }
    if (Object.keys(updateData).length === 0) {
      return { success: false, message: "変更する項目がありません" };
    }
    const { error } = await supabase.from("tasks").update(updateData).eq("id", tasks[0].id);
    if (error) throw error;
    return { success: true, title: tasks[0].title, updated: updateData };
  }

  if (name === "add_insight") {
    const row = scopedRowData(ctx, {
      content: args.content,
      tags: args.tags || null,
    });
    const { error } = await supabase.from("insights").insert(row);
    if (error) throw error;
    return { success: true, content: args.content };
  }

  if (name === "list_insights") {
    const limit = args.limit || 10;
    let query = supabase
      .from("insights")
      .select("id, content, tags, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    query = applyInsightsScope(query, ctx);
    const { data, error } = await query;
    if (error) throw error;
    return { insights: data || [] };
  }

  if (name === "export_insights_to_google_drive") {
    let query = supabase
      .from("insights")
      .select("id, content, tags, created_at")
      .is("exported_at", null)
      .order("created_at", { ascending: true });
    query = applyInsightsScope(query, ctx);
    const { data, error } = await query;
    if (error) throw error;

    if (!data?.length) {
      return { success: true, count: 0, message: "未エクスポートの気づきはありません" };
    }

    if (ctx.legacy) {
      return { success: false, message: "法人設定後にエクスポートできます" };
    }

    const folderId = await getOrganizationFolderId(supabase, ctx.member.organization_id);
    const csv = toCSV(data);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `insights_${date}.csv`;

    const uploaded = await uploadFile({
      folderId,
      name: filename,
      mimeType: "text/csv",
      buffer: Buffer.from("\uFEFF" + csv, "utf-8"),
      subfolder: "insights",
    });

    const ids = data.map((r) => r.id);
    const { error: updateError } = await supabase
      .from("insights")
      .update({ exported_at: new Date().toISOString(), export_destination: "google_drive" })
      .in("id", ids);
    if (updateError) throw updateError;

    return { success: true, filename: uploaded.name, count: data.length };
  }

  return { error: "unknown tool" };
}

module.exports = { executeTool, getWeekRange };
