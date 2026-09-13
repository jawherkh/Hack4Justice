/** Bounded context a notification belongs to. Drives the icon and the link target on the client. */
export const NotificationDomain = {
  PROJECT: "project",
  PROCEDURE: "procedure",
  UPLOAD: "upload",
} as const;
export type NotificationDomain = (typeof NotificationDomain)[keyof typeof NotificationDomain];
export const NOTIFICATION_DOMAINS = Object.values(NotificationDomain) as [
  NotificationDomain,
  ...NotificationDomain[],
];

/** Event kind inside a domain. `payload` carries the values the client interpolates into the message. */
export const NotificationType = {
  PROJECT_CREATED: "PROJECT_CREATED",
  PROCEDURE_STARTED: "PROCEDURE_STARTED",
  PROCEDURE_READY: "PROCEDURE_READY",
  SUBMISSION_UPDATED: "SUBMISSION_UPDATED",
  UPLOAD_EXTRACTED: "UPLOAD_EXTRACTED",
  UPLOAD_FAILED: "UPLOAD_FAILED",
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
export const NOTIFICATION_TYPES = Object.values(NotificationType) as [
  NotificationType,
  ...NotificationType[],
];

export const NOTIFICATION_DOMAIN_BY_TYPE: Record<NotificationType, NotificationDomain> = {
  PROJECT_CREATED: NotificationDomain.PROJECT,
  PROCEDURE_STARTED: NotificationDomain.PROCEDURE,
  PROCEDURE_READY: NotificationDomain.PROCEDURE,
  SUBMISSION_UPDATED: NotificationDomain.PROCEDURE,
  UPLOAD_EXTRACTED: NotificationDomain.UPLOAD,
  UPLOAD_FAILED: NotificationDomain.UPLOAD,
};

/** How many notifications the bell popover shows; the page lists everything. */
export const NOTIFICATION_PREVIEW_LIMIT = 8;
