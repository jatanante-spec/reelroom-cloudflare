import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPostImage, fetchMetadata, needsRefresh } from '../lib/metadata.mjs';

const image = 'https://scontent.xx.fbcdn.net/photo.jpg?a=1&b=2';
const plugin = `<img class="avatar" src="https://scontent.xx.fbcdn.net/avatar.jpg" width="40" height="40"><img src="https://evil.example/a.jpg" width="999" height="999"><img src="https://scontent.xx.fbcdn.net/photo.jpg?a=1&amp;b=2" width="398" height="498"><div data-testid="post_message">Full caption</div>`;
const post = { platform: 'facebook', media_type: 'post', url: 'https://www.facebook.com/123/posts/456/', canonical_url: 'https://www.facebook.com/123/posts/456/', thumbnail_url: 'https://lookaside.fbsbx.com/old', post_text: 'Saved full caption', post_text_fetched: true, metadata_status: 'ok', metadata_fetched_at: new Date().toISOString() };

test('selects a post photo, not an avatar, logo or other host', () => {
  assert.equal(extractPostImage(plugin), image);
  assert.equal(extractPostImage('<img src="https://evil.fbcdn.net.evil.example/x" width="500" height="500">'), null);
  assert.equal(extractPostImage('<img src="https://scontent.xx.fbcdn.net/avatar.jpg" width="40" height="40">'), null);
});

test('repairs legacy post thumbnail once and preserves caption', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(String(url).includes('plugins/post.php') ? plugin : '<meta property="og:description" content="Short">', {status: 200, headers: {'content-type':'text/html'}});
  try {
    assert.equal(needsRefresh(post), true);
    const u = await fetchMetadata(post);
    assert.equal(u.thumbnail_url, image);
    assert.equal(u.post_image_source, 'plugin');
    assert.equal(u.post_image_checked, true);
    assert.equal(u.post_text, undefined);
    assert.equal(needsRefresh({...post, ...u}), false);
  } finally { globalThis.fetch = old; }
});

test('does not replace a custom thumbnail or fabricate a private photo', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(String(url).includes('plugins/post.php') ? plugin : '<meta property="og:image" content="https://lookaside.fbsbx.com/unusable">', {status:200});
  try {
    const u = await fetchMetadata({...post, thumbnail_url:'https://example.org/my-picture.jpg'});
    assert.equal(u.thumbnail_url, undefined);
    const privatePost = await fetchMetadata({...post, url:'https://www.facebook.com/groups/123/permalink/456/', canonical_url:'https://www.facebook.com/groups/123/permalink/456/', thumbnail_url:null});
    assert.equal(privatePost.thumbnail_url, undefined);
    assert.equal(privatePost.post_image_checked, true);
  } finally { globalThis.fetch = old; }
});
