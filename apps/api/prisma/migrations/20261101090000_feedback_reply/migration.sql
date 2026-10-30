-- An admin can answer a message from the feedback form: the answer, when, and by whom.
ALTER TABLE "feedback"
  ADD COLUMN "admin_reply" TEXT,
  ADD COLUMN "replied_at" TIMESTAMPTZ(3),
  ADD COLUMN "replied_by_id" UUID;
