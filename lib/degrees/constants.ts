export const DEGREE_DOC_BUCKET = 'degree-documents';

export const ALLOWED_DEGREE_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

export const MAX_DEGREE_FILE_BYTES = 10 * 1024 * 1024;
