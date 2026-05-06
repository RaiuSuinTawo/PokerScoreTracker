-- Add tokenVersion for single-device login enforcement
ALTER TABLE `User` ADD COLUMN `tokenVersion` INT NOT NULL DEFAULT 0;
