// controllers/accountController.js - change password and delete the account.
const bcrypt = require('bcrypt');

const User = require('../models/User');
const validators = require('../utils/validators');

const BCRYPT_ROUNDS = 10;

// GET /account
function showAccount(req, res) {
  res.render('pages/account', { title: 'Account' });
}

// POST /account/password - needs the current password.
async function changePassword(req, res) {
  const userId = req.currentUser.id; // always from the session
  const currentPassword = String(req.body.currentPassword || '');
  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirmPassword || '');

  const user = await User.findByIdWithHash(userId);
  const currentIsRight = user ? await bcrypt.compare(currentPassword, user.password_hash) : false;

  if (!currentIsRight) {
    req.session.flash = { type: 'error', text: 'Your current password is not correct.' };
    return res.redirect('/account');
  }
  if (!validators.isValidPassword(password)) {
    req.session.flash = {
      type: 'error',
      text: `Your new password needs at least ${validators.MIN_PASSWORD_LENGTH} characters.`
    };
    return res.redirect('/account');
  }
  if (password !== confirmPassword) {
    req.session.flash = { type: 'error', text: 'The two new passwords do not match.' };
    return res.redirect('/account');
  }

  await User.updatePassword(userId, await bcrypt.hash(password, BCRYPT_ROUNDS));
  req.session.flash = { type: 'success', text: 'Your password has been changed.' };
  res.redirect('/account');
}

// POST /account/delete - the user must type DELETE to confirm.
async function deleteAccount(req, res) {
  const userId = req.currentUser.id;
  const confirmation = String(req.body.confirm || '').trim().toUpperCase();

  if (confirmation !== 'DELETE') {
    req.session.flash = { type: 'error', text: 'Please type DELETE to confirm.' };
    return res.redirect('/account');
  }

  // The entries disappear with the account because of ON DELETE CASCADE.
  await User.remove(userId);

  // Then the session goes too, so nothing stays logged in.
  req.session.destroy(() => {
    res.clearCookie('moodjournal.sid');
    res.redirect('/login');
  });
}

module.exports = { showAccount, changePassword, deleteAccount };
