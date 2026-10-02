export type UserContext = {
  userId: string;
  sessionId: string;
  organizationId: string;
  propertyId?: string;
  email: string;
  fullName: string;
  permissions: string[];
};
