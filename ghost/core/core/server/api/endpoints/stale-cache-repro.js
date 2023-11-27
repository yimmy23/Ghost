const logging = require('@tryghost/logging');
const request = require('@tryghost/request');
const adapterManager = require('../../services/adapter-manager');
const models = require('../../models');

// eslint-disable-next-line no-promise-executor-return
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const log = (message) => {
    logging.info(`[STALE CACHE REPRO] ${message}`);
};

const doRequest = async (url) => {
    return request(url, {
        method: 'GET',
        headers: {
            'user-agent': 'Stale Cache Repro' // Ensure we don't use the default user-agent as it will get blocked in Pro
        }
    });
};

module.exports = {
    /**
     * Attempt to reproduce stale cache issue
     *
     * GET <PROTOCOL>://<HOST>/ghost/api/admin/stale_cache_repro/?k=<CONTENT_API_KEY>&j=<JUNK_CACHE_ENTRIES_COUNT>&s=<SLEEP_TIME_SECONDS>
     */
    async repro(frame) {
        const contentAPIKey = frame.original.query.k;
        const junkCacheEntriesCount = frame.original.query.j || 1000;
        const sleepTime = frame.original.query.s * 1000 || 1000;
        const protocol = frame.original.url.secure ? 'https' : 'http';
        const host = frame.original.url.host.replace(/localhost/, '127.0.0.1');

        log(`Protocol: ${protocol}, Host: ${host}, Content API Key: ${contentAPIKey}, Junk Cache Entries Count: ${junkCacheEntriesCount}, Sleep Time: ${sleepTime}ms`);

        const triggerCacheInvalidation = async () => {
            log(`Triggering cache invalidation`);

            await doRequest(`${protocol}://${host}/ghost/api/admin/stale_cache_repro/invalidate_cache/`);
        };

        const cache = adapterManager.getAdapter('cache:postsPublic');

        // Create a new post
        log(`Creating Post`);

        const post = await models.Post.add({
            title: `Repro stale cache test post ${Date.now()}`,
            status: 'published'
        }, frame.options);

        // Invalidate any existing caches and wait 3s to ensure they are invalidated
        await triggerCacheInvalidation();
        await sleep(3000);

        // Request post via content API to ensure it gets cached
        log(`Requesting Post`);

        const preCacheRes = await doRequest(`${protocol}://${host}/ghost/api/content/posts/${post.id}/?key=${contentAPIKey}`);
        const preCacheInvalidationResPost = JSON.parse(preCacheRes.body).posts[0];
        const cacheKeyCountPreInvalidation = (await cache.keys()).length; // Should be 1 (because cache was invalidated but we requested the post again)

        // Fill Redis with junk to repro high SCAN times when invalidating cache
        log(`Filling Redis with junk`);

        await Promise.all(
            Array.from({length: junkCacheEntriesCount}).map((_, idx) => {
                const key = `{"identifier":{"id":"${post.id}_${idx}"},"method":"read","options":{}}`;
                const data = {posts: [post.toJSON()], u: idx};

                return cache.set(key, data);
            })
        );

        // Edit the post and trigger cache invalidation
        log(`Editing Post`);

        await models.Post.edit({
            title: `${post.get('title')} - edited`
        }, {...frame.options, id: post.id});

        await triggerCacheInvalidation();

        // Request post via content API to check if was retrieved from Redis
        log(`Requesting Post Post Cache Invalidation`);

        const postCacheInvalidationRes = await doRequest(`${protocol}://${host}/ghost/api/content/posts/${post.id}/?key=${contentAPIKey}`);
        const postCacheInvalidationResPost = JSON.parse(postCacheInvalidationRes.body).posts[0];
        const cacheKeyCountPostInvalidation = (await cache.keys()).length; // Should be 1 (because cache was invalidated but we requested the post again)
        const wasPostRetrievedFromRedis = preCacheInvalidationResPost.title === postCacheInvalidationResPost.title;

        // Sleep for Xs and check if cache key count has changed
        await sleep(sleepTime);
        const cacheKeyCountPostSleep = (await cache.keys()).length; // Should be the same as `cacheKeyCountPostInvalidation`

        // Clean up - Remove post
        await models.Post.destroy({...frame.options, id: post.id});

        return {
            post_id: post.id,
            post_title: preCacheInvalidationResPost.title,
            edited_post_title: postCacheInvalidationResPost.title,
            was_edited_post_retrieved_from_redis: wasPostRetrievedFromRedis,
            cache_key_count_pre_cache_invalidation: cacheKeyCountPreInvalidation,
            cache_key_count_post_cache_invalidation: cacheKeyCountPostInvalidation,
            cache_key_count_post_sleep: cacheKeyCountPostSleep
        };
    },
    /**
     * Trigger cache invalidation
     *
     * GET <PROTOCOL>://<HOST>/ghost/api/admin/stale_cache_repro/invalidate_cache
     */
    invalidateCache: {
        headers: {
            cacheInvalidate: true
        },
        permissions: false,
        async query() {
            this.headers.cacheInvalidate = true;
        }
    }
};
