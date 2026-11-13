-- NTN certificate, SECP registration and address proof are OPTIONAL
-- (2026-11-13, handwritten notes): no legal structure requires them any
-- more, so they never block company submission or verification. The
-- document types themselves stay active in master data — employers can
-- still upload them voluntarily (shown as "Optional" in the wizard) and
-- already-uploaded files are untouched. Only the requirement rows go.
-- The seed (COMPANY_DOCUMENT_REQUIREMENT_SEED) is insert-only, so this
-- DELETE is what actually changes live databases.
DELETE FROM "company_document_requirements"
WHERE "document_type_code" IN ('NTN_CERTIFICATE', 'SECP_REGISTRATION', 'ADDRESS_PROOF');
