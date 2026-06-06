const handlers = {
  preferences: require("../../lib/handlers/member-preferences"),
};

module.exports = async function handler(req, res) {
  const action = req.query.action;
  const fn = handlers[action];
  if (!fn) {
    return res.status(404).json({
      error: "Unknown member action. Use: preferences",
    });
  }
  return fn(req, res);
};
