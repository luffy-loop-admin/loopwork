export const str = (fd: FormData, key: string): string => String(fd.get(key) ?? '').trim();
export const bool = (fd: FormData, key: string): boolean => fd.get(key) === 'on' || fd.get(key) === 'true';
