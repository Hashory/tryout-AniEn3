import { sqliteTable, text, blob } from 'drizzle-orm/sqlite-core';

export const yjsDocuments = sqliteTable('yjs_documents', {
  id: text('id').primaryKey(),
  documentState: blob('document_state'),
});
