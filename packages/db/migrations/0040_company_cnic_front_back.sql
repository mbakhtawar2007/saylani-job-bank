-- 0040: split the authorised person's CNIC into separate front and back uploads
-- (user decision 2026-11-10).
--
-- The old single AUTHORISED_PERSON_CNIC slot could only hold one file: a second
-- upload superseded the first, so front + back could never both be on file, and
-- the wizard's filename check ("cnic|id|nic|identity") rejected ordinary phone
-- photos such as IMG_1234.jpg, which is why CNIC uploads failed while NTN/SECP
-- (Tokken.pdf) uploaded fine. The two new types are image-only, like the
-- applicant-side CNIC_FRONT / CNIC_BACK.
--
-- Existing AUTHORISED_PERSON_CNIC document rows are left untouched: they stay
-- visible to the verifier as extra documents, but no longer count towards the
-- missing-documents / verify guards, so a company that already uploaded the old
-- single CNIC must upload front and back separately before it can submit.
-- Make room in the sort order first: the seed puts the two new types at 100/110,
-- so the types that followed the old CNIC (NTN onwards) shift by 10 to match.
UPDATE master_data
SET sort_order = sort_order + 10
WHERE type = 'DOCUMENT_TYPE' AND sort_order >= 110;
--> statement-breakpoint
INSERT INTO master_data (type, code, label, meta, sort_order)
VALUES (
  'DOCUMENT_TYPE',
  'AUTHORISED_PERSON_CNIC_FRONT',
  'CNIC of authorised person — front',
  '{
    "appliesTo": "COMPANY",
    "required": true,
    "requiredForCategories": [],
    "requiredAlternativeForCategories": [],
    "mimeTypes": ["image/jpeg", "image/png"],
    "maxSizeMb": 5,
    "multiple": false
  }'::jsonb,
  100
)
ON CONFLICT (type, code) DO UPDATE
SET label = EXCLUDED.label,
    meta = EXCLUDED.meta,
    sort_order = EXCLUDED.sort_order,
    is_active = true;
--> statement-breakpoint
INSERT INTO master_data (type, code, label, meta, sort_order)
VALUES (
  'DOCUMENT_TYPE',
  'AUTHORISED_PERSON_CNIC_BACK',
  'CNIC of authorised person — back',
  '{
    "appliesTo": "COMPANY",
    "required": true,
    "requiredForCategories": [],
    "requiredAlternativeForCategories": [],
    "mimeTypes": ["image/jpeg", "image/png"],
    "maxSizeMb": 5,
    "multiple": false
  }'::jsonb,
  110
)
ON CONFLICT (type, code) DO UPDATE
SET label = EXCLUDED.label,
    meta = EXCLUDED.meta,
    sort_order = EXCLUDED.sort_order,
    is_active = true;
--> statement-breakpoint
-- Retire the old single type (codes are permanent; deactivate, never delete).
UPDATE master_data
SET is_active = false
WHERE type = 'DOCUMENT_TYPE' AND code = 'AUTHORISED_PERSON_CNIC';
--> statement-breakpoint
-- Swap the requirement: every legal structure now needs front AND back.
DELETE FROM company_document_requirements
WHERE document_type_code = 'AUTHORISED_PERSON_CNIC';
--> statement-breakpoint
INSERT INTO company_document_requirements (legal_structure, document_type_code)
VALUES
  ('SOLE_PROPRIETOR', 'AUTHORISED_PERSON_CNIC_FRONT'),
  ('SOLE_PROPRIETOR', 'AUTHORISED_PERSON_CNIC_BACK'),
  ('PARTNERSHIP', 'AUTHORISED_PERSON_CNIC_FRONT'),
  ('PARTNERSHIP', 'AUTHORISED_PERSON_CNIC_BACK'),
  ('PRIVATE_LIMITED', 'AUTHORISED_PERSON_CNIC_FRONT'),
  ('PRIVATE_LIMITED', 'AUTHORISED_PERSON_CNIC_BACK'),
  ('PUBLIC_LIMITED', 'AUTHORISED_PERSON_CNIC_FRONT'),
  ('PUBLIC_LIMITED', 'AUTHORISED_PERSON_CNIC_BACK'),
  ('NGO_TRUST', 'AUTHORISED_PERSON_CNIC_FRONT'),
  ('NGO_TRUST', 'AUTHORISED_PERSON_CNIC_BACK')
ON CONFLICT (legal_structure, document_type_code) DO NOTHING;
