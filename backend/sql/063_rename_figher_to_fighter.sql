-- Rename misspelled 'Figher' to 'Fighter' for all existing PC rows
UPDATE pcs SET type = 'Fighter' WHERE type = 'Figher';
