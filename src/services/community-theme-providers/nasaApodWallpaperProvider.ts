import configRepository from '@/repositories/configRepository';

export const NASA_APOD_WALLPAPER_THEME_ID = 'nasa-apod-wallpaper';

const NASA_APOD_API_URL = 'https://api.nasa.gov/planetary/apod';
const NASA_APOD_API_KEY = 'DEMO_KEY';
const NASA_APOD_CACHE_KEY = 'VRCX_communityThemeProviderNasaApod';
const NASA_APOD_IMAGE_LOOKBACK_DAYS = 7;

interface NasaApodResponse {
    date?: string;
    title?: string;
    url?: string;
    hdurl?: string;
    media_type?: string;
    copyright?: string;
}

interface NasaApodImageSnapshot {
    resolvedForDate: string;
    apodDate: string;
    title: string;
    imageUrl: string;
    copyright: string;
    resolvedAt: string;
}

function currentDateKey(): string {
    return new Date().toISOString().slice(0, 10);
}

function addUtcDays(date: Date, offsetDays: number): Date {
    const nextDate = new Date(date);
    nextDate.setUTCDate(nextDate.getUTCDate() + offsetDays);
    return nextDate;
}

function formatUtcDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function normalizeCache(value: unknown): NasaApodImageSnapshot | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const entry = value as Record<string, unknown>;
    if (!entry.apodDate || !entry.imageUrl) {
        return null;
    }

    return {
        resolvedForDate: String(entry.resolvedForDate || ''),
        apodDate: String(entry.apodDate),
        title: String(entry.title || 'NASA Astronomy Picture of the Day'),
        imageUrl: String(entry.imageUrl),
        copyright: String(entry.copyright || ''),
        resolvedAt: String(entry.resolvedAt || '')
    };
}

function normalizeImageUrl(rawUrl: string): string {
    const parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol === 'http:' && parsedUrl.hostname.endsWith('nasa.gov')) {
        parsedUrl.protocol = 'https:';
    }
    if (parsedUrl.protocol !== 'https:') {
        throw new Error('NASA APOD wallpaper image must use HTTPS.');
    }
    return parsedUrl.toString();
}

function toCssString(value: string): string {
    return `"${String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\A ')}"`;
}

function toCssCommentLine(value: string): string {
    return String(value || '')
        .replace(/\*\//g, '* /')
        .replace(/\r?\n/g, ' ')
        .trim();
}

function normalizeApodImage(
    value: NasaApodResponse,
    resolvedForDate: string
): NasaApodImageSnapshot | null {
    if (value.media_type !== 'image') {
        return null;
    }

    const imageUrl = normalizeImageUrl(String(value.hdurl || value.url || ''));
    return {
        resolvedForDate,
        apodDate: String(value.date || resolvedForDate),
        title: String(value.title || 'NASA Astronomy Picture of the Day'),
        imageUrl,
        copyright: String(value.copyright || ''),
        resolvedAt: new Date().toISOString()
    };
}

async function fetchApod(date?: string): Promise<NasaApodResponse> {
    const url = new URL(NASA_APOD_API_URL);
    url.searchParams.set('api_key', NASA_APOD_API_KEY);
    if (date) {
        url.searchParams.set('date', date);
    }

    const response = await fetch(url.toString(), {
        cache: 'no-cache'
    });
    if (!response.ok) {
        throw new Error(
            `Failed to load NASA APOD: ${response.status} ${response.statusText}`
        );
    }

    return (await response.json()) as NasaApodResponse;
}

async function fetchLatestApodImage(): Promise<NasaApodImageSnapshot> {
    const resolvedForDate = currentDateKey();
    const now = new Date();
    for (let offset = 0; offset <= NASA_APOD_IMAGE_LOOKBACK_DAYS; offset += 1) {
        const date = offset === 0 ? undefined : formatUtcDate(addUtcDays(now, -offset));
        const snapshot = normalizeApodImage(
            await fetchApod(date),
            resolvedForDate
        );
        if (snapshot) {
            return snapshot;
        }
    }

    throw new Error('NASA APOD did not return an image in the recent archive.');
}

async function loadApodImageSnapshot(): Promise<NasaApodImageSnapshot> {
    const today = currentDateKey();
    const cached = normalizeCache(
        await configRepository.getObject(NASA_APOD_CACHE_KEY, null)
    );
    if (cached?.resolvedForDate === today) {
        return cached;
    }

    try {
        const snapshot = await fetchLatestApodImage();
        await configRepository.setObject(NASA_APOD_CACHE_KEY, snapshot);
        return snapshot;
    } catch (error) {
        if (cached) {
            console.warn(
                'Unable to refresh NASA APOD wallpaper; using cached image.',
                error
            );
            return cached;
        }
        throw error;
    }
}

export function isNasaApodWallpaperThemeId(themeId: string): boolean {
    return themeId === NASA_APOD_WALLPAPER_THEME_ID;
}

export async function resolveNasaApodWallpaperCss(
    cssTemplate: string
): Promise<string> {
    const snapshot = await loadApodImageSnapshot();
    const copyright = snapshot.copyright
        ? `Copyright: ${toCssCommentLine(snapshot.copyright)}`
        : 'Copyright: not provided by APOD response';

    return `${cssTemplate.trim()}

/*
  NASA APOD provider.
  Title: ${toCssCommentLine(snapshot.title)}
  Date: ${toCssCommentLine(snapshot.apodDate)}
  ${copyright}
  VRCX-0 references the remote APOD image URL and does not redistribute it.
*/
:root {
  --vrcx-0-wallpaper-image: url(${toCssString(snapshot.imageUrl)});
  --vrcx-0-apod-title: ${toCssString(snapshot.title)};
  --vrcx-0-apod-date: ${toCssString(snapshot.apodDate)};
  --vrcx-0-apod-copyright: ${toCssString(snapshot.copyright)};
}
`;
}
