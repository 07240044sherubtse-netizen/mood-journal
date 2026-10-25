// controllers/adminController.js - the super admin dashboard.
// A super admin manages ACCOUNTS only. There is no page and no query anywhere
// in this app that lets an admin read somebody's note or single moods.
const User = require('../models/User');
const Admin = require('../models/Admin');
const { todayInTimezone, formatDateTime } = require('../utils/dates');

const PAGE_SIZE = 10;       // users per page
const RECENT_ACTIONS = 20;  // lines in the changelog

// The search box: trimmed text, never a pattern, never longer than 100 characters.
function cleanSearch(value) {
  return typeof value === 'string' ? value.trim().slice(0, 100) : '';
}

function parsePage(value) {
  const page = Number.parseInt(String(value), 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

// A small helper: remember a message, then go back to the dashboard.
function back(req, res, text, type = 'error') {
  req.session.flash = { type, text };
  res.redirect('/admin');
}

// GET /admin?q=&page=
async function showAdmin(req, res) {
  const search = cleanSearch(req.query.q);

  // Count first, so the page number can never point past the last page.
  const counted = await User.countUsers(search);
  const totalPages = Math.max(1, Math.ceil(counted.total / PAGE_SIZE));
  const page = Math.min(parsePage(req.query.page), totalPages);

  const [stats, users, actions] = await Promise.all([
    Admin.getStats(todayInTimezone()),
    User.listUsers(search, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    Admin.recentActions(RECENT_ACTIONS)
  ]);

  res.render('pages/admin', {
    title: 'Admin',
    pageClass: 'page--wide',
    stats,
    search,
    page,
    totalPages,
    matchedUsers: counted.total,
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: user.is_verified,
      isActive: user.is_active,
      joined: formatDateTime(user.created_at)
    })),
    actions: actions.map((action) => ({
      id: action.id,
      action: action.action,
      adminName: action.admin_name,
      targetName: action.target_name,
      when: formatDateTime(action.created_at)
    }))
  });
}

// The target of an action, or null when the URL does not name a real user.
async function findTarget(id) {
  const number = Number.parseInt(String(id), 10);
  if (!Number.isInteger(number) || number <= 0) return null;
  return User.findById(number);
}

// POST /admin/users/:id/deactivate
async function deactivateUser(req, res) {
  const admin = req.currentUser; // the admin is always the session user
  const target = await findTarget(req.params.id);

  if (!target) return back(req, res, 'That account does not exist.');
  if (target.id === admin.id) {
    return back(req, res, 'You cannot deactivate your own account.');
  }
  // Admins protect each other: no super admin can switch another one off.
  if (target.role === 'superadmin') {
    return back(req, res, 'Super admins cannot be deactivated.');
  }
  if (!target.is_active) {
    return back(req, res, `${target.name} is already deactivated.`);
  }

  await User.setActive(target.id, false);
  await Admin.logAction(admin.id, 'deactivate', target.id); // written down
  return back(req, res, `${target.name} can no longer log in.`, 'success');
}

// POST /admin/users/:id/reactivate
async function reactivateUser(req, res) {
  const admin = req.currentUser;
  const target = await findTarget(req.params.id);

  if (!target) return back(req, res, 'That account does not exist.');
  if (target.is_active) {
    return back(req, res, `${target.name} is already active.`);
  }

  await User.setActive(target.id, true);
  await Admin.logAction(admin.id, 'reactivate', target.id);
  return back(req, res, `${target.name} can log in again.`, 'success');
}

// POST /admin/users/:id/verify - for somebody who never got the email.
async function verifyUser(req, res) {
  const admin = req.currentUser;
  const target = await findTarget(req.params.id);

  if (!target) return back(req, res, 'That account does not exist.');
  if (target.is_verified) {
    return back(req, res, `${target.name} is already verified.`);
  }

  await User.markVerified(target.id);
  await Admin.logAction(admin.id, 'verify', target.id);
  return back(req, res, `${target.name} is verified now.`, 'success');
}

module.exports = { showAdmin, deactivateUser, reactivateUser, verifyUser };
