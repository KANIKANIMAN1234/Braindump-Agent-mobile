const handlers = {
  setup: require("../../lib/handlers/org-setup"),
  tree: require("../../lib/handlers/org-tree-api"),
  invite: require("../../lib/handlers/org-invite"),
  members: require("../../lib/handlers/org-members"),
  settings: require("../../lib/handlers/org-settings"),
};

module.exports = async function handler(req, res) {
  const action = req.query.action;
  const fn = handlers[action];
  if (!fn) {
    return res.status(404).json({
      error: "Unknown org action. Use: setup, tree, invite, members",
    });
  }
  return fn(req, res);
};
