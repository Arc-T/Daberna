-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('WAITING', 'STARTED', 'LINE_COMPLETED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlayerMatchResult" AS ENUM ('PENDING', 'LINE_WINNER', 'FULL_HOUSE_WINNER', 'BOTH_WINNER', 'LOST');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'GAME_ENTRY', 'WINNING', 'REFERRAL_REWARD', 'GIFT', 'BOT_WINNING');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED_FRAUD', 'REJECTED_MISMATCH', 'PAID');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'AWARDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT,
    "password" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "isNewPlayer" BOOLEAN NOT NULL DEFAULT true,
    "completedGames" INTEGER NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "withdrawableBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "referralRewardUsed" BOOLEAN NOT NULL DEFAULT false,
    "referrerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entryFee" DECIMAL(15,2) NOT NULL,
    "minCards" INTEGER NOT NULL DEFAULT 1,
    "maxCards" INTEGER NOT NULL DEFAULT 4,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "botEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "numbers" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usedInMatch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "roomEntryFee" DECIMAL(15,2) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'WAITING',
    "totalCards" INTEGER NOT NULL DEFAULT 0,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "calledNumbers" JSONB,
    "lineWinnerId" TEXT,
    "linePrize" DECIMAL(15,2),
    "fullHouseWinnerId" TEXT,
    "fullHousePrize" DECIMAL(15,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerMatch" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT,
    "cards" JSONB NOT NULL,
    "cardCount" INTEGER NOT NULL,
    "entryAmount" DECIMAL(15,2) NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "botUsername" TEXT,
    "botStats" JSONB,
    "result" "PlayerMatchResult" NOT NULL DEFAULT 'PENDING',
    "prizeAmount" DECIMAL(15,2),
    "lineWinner" BOOLEAN NOT NULL DEFAULT false,
    "fullHouseWinner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cardId" TEXT,

    CONSTRAINT "PlayerMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchNumber" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "MatchNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "balanceBefore" DECIMAL(15,2) NOT NULL,
    "balanceAfter" DECIMAL(15,2) NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "referenceId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "iban" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "rewardAmount" DECIMAL(15,2) NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "firstPurchaseAmount" DECIMAL(15,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "stats" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriticalState" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "playerMatchId" TEXT NOT NULL,
    "remainingNumbers" JSONB NOT NULL,
    "sharedNumbers" JSONB,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CriticalState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteCode_key" ON "User"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_inviteCode_idx" ON "User"("inviteCode");

-- CreateIndex
CREATE INDEX "User_phoneNumber_idx" ON "User"("phoneNumber");

-- CreateIndex
CREATE INDEX "User_isGuest_idx" ON "User"("isGuest");

-- CreateIndex
CREATE INDEX "User_isNewPlayer_idx" ON "User"("isNewPlayer");

-- CreateIndex
CREATE UNIQUE INDEX "Room_name_key" ON "Room"("name");

-- CreateIndex
CREATE INDEX "Room_isActive_idx" ON "Room"("isActive");

-- CreateIndex
CREATE INDEX "Room_entryFee_idx" ON "Room"("entryFee");

-- CreateIndex
CREATE INDEX "Card_isActive_idx" ON "Card"("isActive");

-- CreateIndex
CREATE INDEX "Card_usedInMatch_idx" ON "Card"("usedInMatch");

-- CreateIndex
CREATE INDEX "Match_roomId_idx" ON "Match"("roomId");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE INDEX "Match_startTime_idx" ON "Match"("startTime");

-- CreateIndex
CREATE INDEX "Match_endTime_idx" ON "Match"("endTime");

-- CreateIndex
CREATE INDEX "Match_createdAt_idx" ON "Match"("createdAt");

-- CreateIndex
CREATE INDEX "PlayerMatch_matchId_idx" ON "PlayerMatch"("matchId");

-- CreateIndex
CREATE INDEX "PlayerMatch_userId_idx" ON "PlayerMatch"("userId");

-- CreateIndex
CREATE INDEX "PlayerMatch_isBot_idx" ON "PlayerMatch"("isBot");

-- CreateIndex
CREATE INDEX "PlayerMatch_result_idx" ON "PlayerMatch"("result");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerMatch_matchId_userId_key" ON "PlayerMatch"("matchId", "userId");

-- CreateIndex
CREATE INDEX "MatchNumber_matchId_idx" ON "MatchNumber"("matchId");

-- CreateIndex
CREATE INDEX "MatchNumber_number_idx" ON "MatchNumber"("number");

-- CreateIndex
CREATE INDEX "MatchNumber_orderIndex_idx" ON "MatchNumber"("orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "MatchNumber_matchId_number_key" ON "MatchNumber"("matchId", "number");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "Transaction_referenceId_idx" ON "Transaction"("referenceId");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_userId_idx" ON "WithdrawalRequest"("userId");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_status_idx" ON "WithdrawalRequest"("status");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_createdAt_idx" ON "WithdrawalRequest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE INDEX "Referral_referredUserId_idx" ON "Referral"("referredUserId");

-- CreateIndex
CREATE INDEX "Referral_status_idx" ON "Referral"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_username_key" ON "Bot"("username");

-- CreateIndex
CREATE INDEX "Bot_isActive_idx" ON "Bot"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- CreateIndex
CREATE INDEX "Setting_key_idx" ON "Setting"("key");

-- CreateIndex
CREATE INDEX "CriticalState_matchId_idx" ON "CriticalState"("matchId");

-- CreateIndex
CREATE INDEX "CriticalState_cardId_idx" ON "CriticalState"("cardId");

-- CreateIndex
CREATE INDEX "CriticalState_playerMatchId_idx" ON "CriticalState"("playerMatchId");

-- CreateIndex
CREATE INDEX "CriticalState_enteredAt_idx" ON "CriticalState"("enteredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CriticalState_matchId_cardId_key" ON "CriticalState"("matchId", "cardId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_lineWinnerId_fkey" FOREIGN KEY ("lineWinnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_fullHouseWinnerId_fkey" FOREIGN KEY ("fullHouseWinnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatch" ADD CONSTRAINT "PlayerMatch_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatch" ADD CONSTRAINT "PlayerMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatch" ADD CONSTRAINT "PlayerMatch_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchNumber" ADD CONSTRAINT "MatchNumber_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriticalState" ADD CONSTRAINT "CriticalState_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriticalState" ADD CONSTRAINT "CriticalState_playerMatchId_fkey" FOREIGN KEY ("playerMatchId") REFERENCES "PlayerMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
