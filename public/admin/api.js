/* Talks to the site's own backend (/api/admin/*). In the preview (meta admin-demo) it uses sample data instead. */
(function () {
  'use strict';
  var demo = !!document.querySelector('meta[name="admin-demo"]');
  var A = { demo: demo };

  function req(method, path, body, raw) {
    if (demo) {
      return new Promise(function (res, rej) {
        setTimeout(function () { var r = window.AdminDemo(method, path, body); r.ok === false ? rej(new Error(r.error || 'Failed')) : res(r); }, 120);
      });
    }
    var opt = { method: method, headers: { 'x-admin': '1' }, credentials: 'same-origin' };
    if (raw) { opt.body = raw.data; opt.headers['content-type'] = raw.type; }
    else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['content-type'] = 'application/json'; }
    return fetch(path, opt).then(function (r) {
      var json = /json/.test(r.headers.get('content-type') || '');
      return (json ? r.json() : Promise.resolve({ ok: false, error: 'The server did not answer. Check that the site is deployed with its functions.' })).then(function (j) {
        if (r.status === 401 && /\/api\/admin\//.test(path)) { A.onSignedOut && A.onSignedOut(); }
        if (!r.ok || j.ok === false) { var e = new Error(j.error || 'Something went wrong.'); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  A.get = function (p) { return req('GET', p); };
  A.put = function (p, b) { return req('PUT', p, b); };
  A.post = function (p, b) { return req('POST', p, b); };
  A.patch = function (p, b) { return req('PATCH', p, b); };
  A.del = function (p) { return req('DELETE', p); };
  A.upload = function (blob) { return demo ? Promise.resolve({ url: URL.createObjectURL(blob) }) : req('POST', '/api/admin/upload', undefined, { data: blob, type: blob.type }); };

  /* Sign-in state. Returns { configured, signedIn } or { offline: true }. */
  A.status = function () {
    if (demo) return Promise.resolve({ configured: true, signedIn: true });
    return fetch('/api/login', { credentials: 'same-origin' }).then(function (r) {
      if (!/json/.test(r.headers.get('content-type') || '')) return { offline: true };
      return r.json();
    }).catch(function () { return { offline: true }; });
  };
  A.login = function (password) {
    return fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: password }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || 'Could not sign in.'); return j; }); });
  };
  A.logout = function () { return demo ? Promise.resolve() : fetch('/api/login', { method: 'DELETE', credentials: 'same-origin' }); };

  /* Shared small helpers */
  A.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  A.inr = function (n) { return '₹' + Math.round(n).toLocaleString('en-IN'); };
  A.toast = function (msg) {
    var t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('on'); clearTimeout(A._t); A._t = setTimeout(function () { t.classList.remove('on'); }, 3000);
  };
  A.copy = function (text, done) {
    var ok = function () { A.toast(done || 'Copied'); };
    try { navigator.clipboard.writeText(text).then(ok, function () { A.toast(text); }); } catch (e) { A.toast(text); }
  };
  window.Admin = A;
})();
