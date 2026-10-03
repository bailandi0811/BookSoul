export type OtpPurpose = 'REGISTRATION' | 'EMAIL_VERIFICATION';
export type ChallengePurpose = OtpPurpose | 'PASSWORD_RESET';
export type AuthClock = () => Date;
export type ChallengeTarget = {
  email: string;
  purpose: ChallengePurpose;
  userId: string | null;
};
export type PreparedChallenge = ChallengeTarget & {
  id: string;
  verificationId: string;
  generation: number;
  secret: string;
  expiresAt: Date;
  resendAllowedAt: Date;
};
export type ChallengeProof = ChallengeTarget & {
  verificationId: string;
  secret: string;
};
export type VerifiedChallenge = ChallengeTarget & {
  id: string;
  generation: number;
};
export type ResetChallengeTarget = {
  id: string;
  verificationId: string;
  email: string;
  purpose: 'PASSWORD_RESET';
  userId: string;
};
export type ChallengeVerification =
  | { status: 'valid'; challenge: VerifiedChallenge }
  | { status: 'invalid' };
export type ChallengeReceipt = {
  verificationId: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
};
