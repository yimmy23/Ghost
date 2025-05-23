const path = require('path');
const {URL} = require('url');

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DEFAULT_HOST_ARG = /.*/;

const getHostInfo = (config) => {
    const frontendHost = new URL(config.getSiteUrl()).hostname;

    const backendHost = config.getAdminUrl() ? (new URL(config.getAdminUrl()).hostname) : '';
    const hasSeparateBackendHost = backendHost && backendHost !== frontendHost;

    return {
        backendHost,
        hasSeparateBackendHost
    };
};

/**
 *
 * @returns {string|RegExp}
 */
const getBackendMountPath = function getFrontendMountPath() {
    const {backendHost, hasSeparateBackendHost} = getHostInfo(this);

    // with a separate admin url only serve on that host, otherwise serve on all hosts
    return (hasSeparateBackendHost) && backendHost ? backendHost : DEFAULT_HOST_ARG;
};

/**
 *
 * @returns {string|RegExp}
 */
const getFrontendMountPath = function getFrontendMountPath() {
    const {backendHost, hasSeparateBackendHost} = getHostInfo(this);

    // with a separate admin url we adjust the frontend vhost to exclude requests to that host, otherwise serve on all hosts
    return (hasSeparateBackendHost && backendHost) ? new RegExp(`^(?!${escapeRegExp(backendHost)}).*`) : DEFAULT_HOST_ARG;
};

/**
 * @callback isPrivacyDisabledFn
 * @param {string} privacyFlag - the flag to be looked up
 * @returns {boolean}
 */
const isPrivacyDisabled = function isPrivacyDisabled(privacyFlag) {
    if (!this.get('privacy')) {
        return false;
    }

    // CASE: disable all privacy features
    if (this.get('privacy').useTinfoil === true) {
        // CASE: you can still enable single features
        if (this.get('privacy')[privacyFlag] === true) {
            return false;
        }

        return true;
    }

    return this.get('privacy')[privacyFlag] === false;
};

/**
 * @callback getStaticUrlPrefixFn
 * @param {'images'|'media'|'files'} type
 * @returns {string}
 */
function getStaticUrlPrefix(type) {
    switch (type) {
    case 'images':
        return 'content/images';
    case 'media':
        return 'content/media';
    case 'files':
        return 'content/files';
    default:
        // eslint-disable-next-line ghost/ghost-custom/no-native-error
        throw new Error('getStaticUrlPrefix was called with: ' + type);
    }
}

/**
 * @callback getContentPathFn
 * @param {string} type - the type of context you want the path for
 * @returns {string}
 */
const getContentPath = function getContentPath(type) {
    switch (type) {
    case 'images':
        return path.join(this.get('paths:contentPath'), 'images/');
    case 'media':
        return path.join(this.get('paths:contentPath'), 'media/');
    case 'files':
        return path.join(this.get('paths:contentPath'), 'files/');
    case 'themes':
        return path.join(this.get('paths:contentPath'), 'themes/');
    case 'adapters':
        return path.join(this.get('paths:contentPath'), 'adapters/');
    case 'logs':
        return path.join(this.get('paths:contentPath'), 'logs/');
    case 'data':
        return path.join(this.get('paths:contentPath'), 'data/');
    case 'settings':
        return path.join(this.get('paths:contentPath'), 'settings/');
    case 'public':
        return path.join(this.get('paths:contentPath'), 'public/');
    default:
        // new Error is allowed here, as we do not want config to depend on @tryghost/error
        // @TODO: revisit this decision when @tryghost/error is no longer dependent on all of ghost-ignition
        // eslint-disable-next-line ghost/ghost-custom/no-native-error
        throw new Error('getContentPath was called with: ' + type);
    }
};

/**
 * @typedef ConfigHelpers
 * @property {isPrivacyDisabledFn} isPrivacyDisabled
 * @property {getContentPathFn} getContentPath
 * @property {getStaticUrlPrefixFn} getStaticUrlPrefix
 */
module.exports.bindAll = (nconf) => {
    nconf.isPrivacyDisabled = isPrivacyDisabled.bind(nconf);
    nconf.getContentPath = getContentPath.bind(nconf);
    nconf.getBackendMountPath = getBackendMountPath.bind(nconf);
    nconf.getFrontendMountPath = getFrontendMountPath.bind(nconf);
    nconf.getStaticUrlPrefix = getStaticUrlPrefix.bind(nconf);
};
