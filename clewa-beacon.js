/* Clewa page-view beacon — first-party, no cookies, no identifiers. */
(function () {
  try {
    if (navigator.doNotTrack === '1') return;
    var w = window.innerWidth || 0;
    var viewport = w < 700 ? 'mobile' : w < 1100 ? 'tablet' : 'desktop';
    var payload = JSON.stringify({
      path: location.pathname.replace(/^.*\/clewa/, '') + (location.hash || ''),
      referrer: document.referrer ? document.referrer.slice(0, 200) : null,
      viewport: viewport,
    });
    var url = 'https://cxchrwccojvurqcxakyw.supabase.co/rest/v1/page_views';
    var key = 'sb_publishable_6amZ7V2RrOF6sVjHYw_0DA_2cHTdS8o';
    fetch(url, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: payload,
    }).catch(function () {});
  } catch (e) { /* analytics must never break the page */ }
})();
