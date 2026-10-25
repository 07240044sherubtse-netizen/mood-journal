// tests/helpers/http.js - a tiny "browser" for the tests.
// A client keeps its own session cookie, so two clients behave like two
// different people using two different browsers.
const request = require('supertest');
const app = require('../../app');

// A fresh client with its own cookie jar.
function client() {
  return request.agent(app);
}

// The CSRF token the server put into a form on this page, exactly as a browser
// would send it back. The token changes after logging in, so always fetch it
// from a page of the current session.
async function csrf(agent, url = '/') {
  const res = await agent.get(url);
  const match = /name="_csrf" value="([^"]+)"/.exec(res.text);
  if (!match) {
    throw new Error(`No CSRF token on ${url} (status ${res.status})`);
  }
  return match[1];
}

// Log in through the real form.
async function login(agent, email, password = 'password123') {
  const token = await csrf(agent, '/login');
  return agent.post('/login').type('form').send({ _csrf: token, email, password });
}

// A client that is already logged in.
async function signedIn(email, password = 'password123') {
  const agent = client();
  const res = await login(agent, email, password);
  if (res.status !== 302) {
    throw new Error(`Could not log in as ${email} (status ${res.status})`);
  }
  return agent;
}

module.exports = { app, client, csrf, login, signedIn };
