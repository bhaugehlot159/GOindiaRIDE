function requireAnyRole(...roles) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (!roles.includes(userRole)) {
      return res.status(403).json({ message: 'Role access denied' });
    }

    return next();
  };
}

function requireAnyAccountType(...accountTypes) {
  return (req, res, next) => {
    const accountType = req.user?.accountType;
    if (!accountType) {
      return res.status(401).json({ message: 'Account type not available in session' });
    }

    if (!accountTypes.includes(accountType)) {
      return res.status(403).json({ message: 'Account type access denied' });
    }

    return next();
  };
}

module.exports = {
  requireAnyRole,
  requireAnyAccountType
};
