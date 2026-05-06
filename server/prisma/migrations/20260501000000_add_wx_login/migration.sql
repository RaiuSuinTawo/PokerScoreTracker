-- AlterTable: make username and passwordHash nullable, add wxOpenid
ALTER TABLE `User` MODIFY COLUMN `username` VARCHAR(191) NULL;
ALTER TABLE `User` MODIFY COLUMN `passwordHash` VARCHAR(191) NULL;
ALTER TABLE `User` ADD COLUMN `wxOpenid` VARCHAR(191) NULL;

-- Change default for mustChangePwd from true to false
ALTER TABLE `User` ALTER COLUMN `mustChangePwd` SET DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX `User_wxOpenid_key` ON `User`(`wxOpenid`);
