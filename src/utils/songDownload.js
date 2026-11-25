// 通过用户自己的 KuGouMusicApi 服务器中转下载当前歌曲。
// 浏览器不直连酷狗 CDN，避免跨域头缺失导致的下载失败；
// 服务器端由 module/song_download.js 取回文件流并以附件形式返回。
import httpClient from './request';

const sanitizeFileName = (name) => {
    return String(name || 'song')
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) || 'song';
};

const fileNameFromDisposition = (disposition) => {
    if (!disposition) return '';
    const starMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (starMatch) {
        try {
            return decodeURIComponent(starMatch[1]);
        } catch {
            return starMatch[1];
        }
    }
    const quotedMatch = /filename="([^"]+)"/i.exec(disposition);
    return quotedMatch ? quotedMatch[1] : '';
};

const extFromUrl = (url) => {
    const match = /\.([a-zA-Z0-9]{2,5})(?:[?#]|$)/.exec(String(url || ''));
    return match ? match[1].toLowerCase() : '';
};

export const downloadSongViaProxy = async (song) => {
    const hash = song.playHash || song.hash;
    if (!hash) throw new Error('no hash');

    const baseName = sanitizeFileName(`${song.author || ''} - ${song.name || ''}`.replace(/^ - /, ''));
    const params = {
        hash,
        filename: baseName,
        t: Date.now(),
    };
    if (song.resolvedQuality) params.quality = song.resolvedQuality;
    if (!song.isAuthenticated) params.free_part = 1;

    // __rawResponse: 绕过 request.js 的 JSON 响应拦截，原样拿到 blob。
    // timeout: 0: 取消默认 10 秒超时，整首歌下载完再返回。
    const response = await httpClient.get('/song/download', {
        params,
        responseType: 'blob',
        timeout: 0,
        __rawResponse: true,
    });

    const blob = response.data;
    if (!blob || blob.size === 0) throw new Error('empty file');

    const dispositionName = fileNameFromDisposition(response.headers?.['content-disposition']);
    const fileName = dispositionName || `${baseName}.${extFromUrl(song.url) || 'mp3'}`;

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return fileName;
};
