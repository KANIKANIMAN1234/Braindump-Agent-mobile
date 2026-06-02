const handlers = {
  me: require("../../lib/handlers/auth-me"),
  activate: require("../../lib/handlers/auth-activate"),
};

module.exports = async function handler(req, res) {
  const action = req.query.action;
  const fn = handlers[action];
  if (!fn) {
    return res.status(404).json({ error: "Unknown auth action. Use: me, activate" });
  }
  return fn(req, res);
};
