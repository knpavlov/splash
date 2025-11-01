import { CasesRepository } from './cases.repository.js';
import { CaseFileUpload, CaseFolder } from './cases.types.js';

export class CasesService {
  constructor(private readonly repository: CasesRepository) {}

  listFolders(): Promise<CaseFolder[]> {
    return this.repository.listFolders();
  }

  async getFolder(id: string): Promise<CaseFolder> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }
    const folder = await this.repository.findFolderById(trimmed);
    if (!folder) {
      throw new Error('NOT_FOUND');
    }
    return folder;
  }

  async createFolder(name: string): Promise<CaseFolder> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('INVALID_NAME');
    }
    const isTaken = await this.repository.isNameTaken(trimmed);
    if (isTaken) {
      throw new Error('DUPLICATE_NAME');
    }
    return this.repository.createFolder(trimmed);
  }

  async renameFolder(id: string, name: string, expectedVersion: number): Promise<CaseFolder> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('INVALID_NAME');
    }
    const isTaken = await this.repository.isNameTaken(trimmed, id);
    if (isTaken) {
      throw new Error('DUPLICATE_NAME');
    }
    const updated = await this.repository.renameFolder(id, trimmed, expectedVersion);
    if (updated === 'version-conflict') {
      throw new Error('VERSION_CONFLICT');
    }
    if (!updated) {
      throw new Error('NOT_FOUND');
    }
    return updated;
  }

  async deleteFolder(id: string): Promise<string> {
    const deleted = await this.repository.deleteFolder(id);
    if (!deleted) {
      throw new Error('NOT_FOUND');
    }
    return id;
  }

  async registerFiles(
    folderId: string,
    files: CaseFileUpload[],
    expectedVersion: number
  ): Promise<CaseFolder> {
    if (!files.length) {
      throw new Error('INVALID_INPUT');
    }
    const updated = await this.repository.addFiles(folderId, files, expectedVersion);
    if (updated === 'version-conflict') {
      throw new Error('VERSION_CONFLICT');
    }
    if (!updated) {
      throw new Error('NOT_FOUND');
    }
    return updated;
  }

  async removeFile(folderId: string, fileId: string, expectedVersion: number): Promise<CaseFolder> {
    const updated = await this.repository.removeFile(folderId, fileId, expectedVersion);
    if (updated === 'version-conflict') {
      throw new Error('VERSION_CONFLICT');
    }
    if (!updated) {
      throw new Error('NOT_FOUND');
    }
    return updated;
  }
}
