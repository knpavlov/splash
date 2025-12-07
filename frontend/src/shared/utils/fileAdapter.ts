export interface FileRecord {
    fileName: string;
    mimeType: string;
    size: number;
    dataUrl: string;
}

export const convertFilesToRecords = (
    files: File[],
    onProgress?: (percentage: number) => void
): Promise<FileRecord[]> => {
    let completed = 0;
    const total = files.length;

    if (total === 0) {
        if (onProgress) onProgress(100);
        return Promise.resolve([]);
    }

    return Promise.all(
        files.map((file) => {
            return new Promise<FileRecord>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    completed++;
                    if (onProgress) {
                        onProgress(Math.round((completed / total) * 100));
                    }
                    resolve({
                        fileName: file.name,
                        mimeType: file.type,
                        size: file.size,
                        dataUrl: reader.result as string
                    });
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        })
    );
};
