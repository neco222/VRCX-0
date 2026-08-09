const RELEASE_CHANNELS = Object.freeze({
    STABLE: 'Stable'
});

const MAX_MAJOR_VERSION = 99;
const MAX_MINOR_VERSION = 999;
const MAX_PATCH_VERSION = 999;
const RELEASE_VERSION_PATTERN =
    /^v?(?<major>[1-9][0-9]*)\.(?<minor>0|[1-9][0-9]*)\.(?<patch>0|[1-9][0-9]*)$/;

const CHANNEL_BY_INPUT = new Map([
    ['stable', RELEASE_CHANNELS.STABLE],
    [RELEASE_CHANNELS.STABLE, RELEASE_CHANNELS.STABLE]
]);

function normalizeReleaseChannel(channel) {
    return CHANNEL_BY_INPUT.get(String(channel || '').trim()) || null;
}

function isBoundedInteger(value, max) {
    return Number.isInteger(value) && value >= 1 && value <= max;
}

function buildVersionInfo({ major, minor, patch, channel }) {
    const normalizedChannel =
        normalizeReleaseChannel(channel) || RELEASE_CHANNELS.STABLE;
    const canonicalVersion = `${major}.${minor}.${patch}`;

    return {
        major,
        minor,
        patchNumber: patch,
        betaNumber: null,
        alphaNumber: null,
        channel: normalizedChannel,
        buildVersion: canonicalVersion,
        canonicalVersion,
        displayVersion: canonicalVersion
    };
}

/**
 * @param {string} version
 * @returns {null | {
 *   major: number,
 *   minor: number,
 *   patchNumber: number,
 *   betaNumber: null,
 *   alphaNumber: number | null,
 *   channel: 'Stable',
 *   canonicalVersion: string,
 *   buildVersion: string,
 *   displayVersion: string
 * }}
 */
function parseReleaseVersion(version) {
    const normalizedVersion = String(version || '').trim();
    const match = RELEASE_VERSION_PATTERN.exec(normalizedVersion);
    if (!match?.groups) {
        return null;
    }

    const major = Number.parseInt(match.groups.major, 10);
    const minor = Number.parseInt(match.groups.minor, 10);
    const patch = Number.parseInt(match.groups.patch, 10);
    if (
        !isBoundedInteger(major, MAX_MAJOR_VERSION) ||
        !Number.isInteger(minor) ||
        minor < 0 ||
        minor > MAX_MINOR_VERSION ||
        !Number.isInteger(patch) ||
        patch < 0 ||
        patch > MAX_PATCH_VERSION
    ) {
        return null;
    }

    return buildVersionInfo({
        major,
        minor,
        patch,
        channel: RELEASE_CHANNELS.STABLE
    });
}

/**
 * @param {string} version
 * @returns {string}
 */
function formatReleaseDisplayVersion(version) {
    const parsedVersion = parseReleaseVersion(version);
    if (parsedVersion) {
        return parsedVersion.displayVersion;
    }

    return String(version || '').trim();
}

/**
 * @param {string | ReturnType<typeof parseReleaseVersion>} left
 * @param {string | ReturnType<typeof parseReleaseVersion>} right
 * @returns {number}
 */
function compareReleaseVersions(left, right) {
    const parsedLeft =
        typeof left === 'string' ? parseReleaseVersion(left) : left;
    const parsedRight =
        typeof right === 'string' ? parseReleaseVersion(right) : right;

    if (!parsedLeft && !parsedRight) {
        return 0;
    }
    if (!parsedLeft) {
        return -1;
    }
    if (!parsedRight) {
        return 1;
    }

    const versionDelta =
        parsedLeft.major - parsedRight.major ||
        parsedLeft.minor - parsedRight.minor ||
        parsedLeft.patchNumber - parsedRight.patchNumber;
    if (versionDelta !== 0) {
        return versionDelta;
    }

    return 0;
}

export {
    compareReleaseVersions,
    formatReleaseDisplayVersion,
    parseReleaseVersion
};
