const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const Notification = require('../models/Notification');

const router = express.Router();

function getAudienceScope(user) {
  if (user.role === 'admin' || user.accountType === 'admin') {
    return 'admin';
  }

  if (user.accountType === 'driver') {
    return 'driver';
  }

  return 'customer';
}

function buildInboxFilter(user) {
  const scope = getAudienceScope(user);

  if (scope === 'admin') {
    return {
      $or: [
        { userId: user.id },
        { userId: null, audience: 'admin' }
      ]
    };
  }

  if (scope === 'driver') {
    return {
      $or: [
        { userId: user.id },
        { userId: null, audience: 'driver' }
      ]
    };
  }

  return {
    $or: [
      { userId: user.id },
      { userId: null, audience: 'customer' }
    ]
  };
}

router.get('/', authenticate, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';
  const filter = buildInboxFilter(req.user);

  if (unreadOnly) {
    filter.isRead = false;
  }

  const [items, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Notification.countDocuments({ ...buildInboxFilter(req.user), isRead: false })
  ]);

  return res.status(200).json({
    scope: getAudienceScope(req.user),
    unreadCount,
    count: items.length,
    items
  });
});

router.post('/:id/read', authenticate, async (req, res) => {
  const filter = {
    _id: req.params.id,
    ...buildInboxFilter(req.user)
  };

  const notification = await Notification.findOneAndUpdate(
    filter,
    { isRead: true, readAt: new Date() },
    { new: true }
  ).lean();

  if (!notification) {
    return res.status(404).json({ message: 'Notification not found' });
  }

  return res.status(200).json({
    id: notification._id,
    isRead: notification.isRead,
    readAt: notification.readAt
  });
});

router.post('/read-all', authenticate, async (req, res) => {
  const filter = {
    ...buildInboxFilter(req.user),
    isRead: false
  };

  const result = await Notification.updateMany(filter, {
    isRead: true,
    readAt: new Date()
  });

  return res.status(200).json({ updated: result.modifiedCount || 0 });
});

module.exports = router;
