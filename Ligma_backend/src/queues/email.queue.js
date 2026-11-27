import { Queue } from "bullmq";

import { buildBullMQQueueOptions, registerBullMQQueue } from "../config/bullmq.config.js";
import { buildEmailJobId, emailJobSchema } from "../jobs/email.job.js";

const EMAIL_QUEUE_NAME = "email-delivery";

let emailQueue;

const getEmailQueue = () => {
  if (!emailQueue) {
    emailQueue = registerBullMQQueue(new Queue(EMAIL_QUEUE_NAME, buildBullMQQueueOptions()));
  }

  return emailQueue;
};

const enqueueEmailJob = async (jobData) => {
  const payload = emailJobSchema.parse(jobData);
  const jobName = {
    verification: "send-verification-email",
    invitation: "send-invitation-email",
    "password-reset": "send-password-reset-email",
  }[payload.type];
  return getEmailQueue().add(jobName, payload, {
    jobId: buildEmailJobId(payload),
  });
};

export { EMAIL_QUEUE_NAME, getEmailQueue, enqueueEmailJob };

export default getEmailQueue;