/**
 * Shared document upload pipeline (presigned PUT → confirm → view link),
 * used by the applicant and company document flows.
 */
export {
  confirmDocumentUpload,
  presignDocumentUpload,
  viewDocumentLink,
  VIEW_LINK_SECONDS,
  type ConfirmableDocument,
  type ConfirmDocumentOptions,
  type DocumentLink,
  type DocumentTable,
  type PresignedDocument,
  type PresignDocumentOptions,
  type SignedIn,
} from './confirm';
