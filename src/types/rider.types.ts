export type RiderPaymentSettings = {
  amount: number;
  currency: string;
  qrNote?: string;
  qrUrl?: string;
  updatedAt?: string;
};

export type RiderInvitePublic = {
  id: string;
  inviteToken: string;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string;
    city?: string;
  };
  payment: RiderPaymentSettings;
};

export type RiderApplicationStatus = "submitted" | "approved" | "rejected";

export type RiderApplication = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  fullName: string;
  email: string;
  phone: string;
  documentNumber: string;
  plateNumber: string;
  vehicleOwnerName: string;
  ruatNumber: string;
  ciFrontUrl: string;
  ciBackUrl: string;
  ruatFrontUrl: string;
  ruatBackUrl: string;
  ownerDocumentUrl: string;
  platePhotoUrl: string;
  paymentProofUrl: string;
  paymentProofFileName?: string;
  paymentProofFileSize: number;
  paymentAmount: number;
  paymentCurrency: string;
  paymentQrUrl?: string;
  paymentQrNote?: string;
  status: RiderApplicationStatus;
  resolutionNotes?: string;
  reviewedAt?: string;
  createdAt: string;
};

export type RestaurantRiderStatus = "active" | "suspended";

export type RestaurantRider = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  fullName: string;
  email: string;
  phone: string;
  documentNumber: string;
  plateNumber: string;
  vehicleOwnerName: string;
  ruatNumber: string;
  status: RestaurantRiderStatus;
  membershipAmount: number;
  membershipCurrency: string;
  membershipStartedAt: string;
  membershipValidUntil: string;
  approvedAt: string;
  hasPendingRenewal: boolean;
};

export type RiderRenewalRequestStatus = "submitted" | "approved" | "rejected";

export type RiderRenewalRequest = {
  id: string;
  restaurantRiderId: string;
  restaurantId: string;
  restaurantName: string;
  riderName: string;
  riderPhone: string;
  riderPlateNumber: string;
  paymentAmount: number;
  paymentCurrency: string;
  paymentQrUrl?: string;
  paymentQrNote?: string;
  paymentProofUrl: string;
  paymentProofFileName?: string;
  paymentProofFileSize: number;
  status: RiderRenewalRequestStatus;
  approvedValidUntil?: string;
  reviewedAt?: string;
  resolutionNotes?: string;
  createdAt: string;
};

export type OwnerRiderBranch = {
  restaurantId: string;
  restaurantName: string;
  restaurantCity?: string;
  inviteUrl: string;
  riders: RestaurantRider[];
  renewalRequests: RiderRenewalRequest[];
};
