const quotePath = (filePath) =>
    `"${filePath.replaceAll('\\', '/').replaceAll('"', '\\"')}"`;

export default {
    '*.{js,jsx,ts,tsx,json,jsonc,css,md,mdx,yml,yaml,html}': 'oxfmt --write',
    '*.rs': (files) =>
        `rustfmt --edition 2021 ${files.map(quotePath).join(' ')}`
};
