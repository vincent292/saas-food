"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { riderService } from "@/lib/services/rider.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadPrivateFile } from "@/lib/supabase/storage";

const maxRiderUploadBytes = 5 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const paymentTypes = new Set([...imageTypes, "application/pdf"]);

const riderApplicationSchema = z.object({
  inviteToken: z.string().trim().min(20),
  fullName: z.string().trim().min(3).max(140),
  email: z.string().trim().email().max(180),
  phone: z.string().trim().min(6).max(40),
  documentNumber: z.string().trim().min(4).max(40),
  plateNumber: z.string().trim().min(4).max(30),
  vehicleOwnerName: z.string().trim().min(3).max(140),
  ruatNumber: z.string().trim().min(3).max(80),
});

function isNonEmptyFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

function validateFile(file: File, allowedTypes: Set<string>) {
  return allowedTypes.has(file.type) && file.size <= maxRiderUploadBytes;
}

function riderRedirect(token: string, key: string): never {
  redirect(`/riders/${token}?error=${key}`);
}

async function uploadRequiredFile({
  file,
  folder,
  token,
  allowedTypes = imageTypes,
}: {
  file: FormDataEntryValue | null;
  folder: string;
  token: string;
  allowedTypes?: Set<string>;
}) {
  if (!isNonEmptyFile(file) || !validateFile(file, allowedTypes)) {
    riderRedirect(token, "invalid-file");
  }

  try {
    const url = await uploadPrivateFile(file, folder);
    if (!url) {
      riderRedirect(token, "upload-failed");
    }
    return { file, url };
  } catch {
    riderRedirect(token, "upload-failed");
  }
}

export async function submitRiderApplicationAction(formData: FormData) {
  const parsed = riderApplicationSchema.safeParse({
    inviteToken: formData.get("inviteToken"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    documentNumber: formData.get("documentNumber"),
    plateNumber: formData.get("plateNumber"),
    vehicleOwnerName: formData.get("vehicleOwnerName"),
    ruatNumber: formData.get("ruatNumber"),
  });

  const token = String(formData.get("inviteToken") || "");
  if (!parsed.success) {
    riderRedirect(token, "invalid");
  }
  const data = parsed.data;

  const invite = await riderService.getPublicInvite(data.inviteToken);
  if (!invite) {
    riderRedirect(data.inviteToken, "invalid-invite");
  }

  if (!invite.payment.qrUrl) {
    riderRedirect(data.inviteToken, "payment-unconfigured");
  }

  const admin = createAdminClient();
  if (!admin) {
    riderRedirect(data.inviteToken, "service-role-required");
  }

  const baseFolder = `restaurants/${invite.restaurant.id}/riders/${crypto.randomUUID()}`;
  const [ciFront, ciBack, ruatFront, ruatBack, ownerDocument, platePhoto, paymentProof] = await Promise.all([
    uploadRequiredFile({ file: formData.get("ciFrontFile"), folder: `${baseFolder}/documents`, token: data.inviteToken }),
    uploadRequiredFile({ file: formData.get("ciBackFile"), folder: `${baseFolder}/documents`, token: data.inviteToken }),
    uploadRequiredFile({ file: formData.get("ruatFrontFile"), folder: `${baseFolder}/documents`, token: data.inviteToken }),
    uploadRequiredFile({ file: formData.get("ruatBackFile"), folder: `${baseFolder}/documents`, token: data.inviteToken }),
    uploadRequiredFile({ file: formData.get("ownerDocumentFile"), folder: `${baseFolder}/documents`, token: data.inviteToken }),
    uploadRequiredFile({ file: formData.get("platePhotoFile"), folder: `${baseFolder}/documents`, token: data.inviteToken }),
    uploadRequiredFile({ allowedTypes: paymentTypes, file: formData.get("paymentProofFile"), folder: `${baseFolder}/payment`, token: data.inviteToken }),
  ]);

  const { error } = await admin.from("rider_applications").insert({
    ci_back_url: ciBack.url,
    ci_front_url: ciFront.url,
    document_number: data.documentNumber,
    email: data.email.toLowerCase(),
    full_name: data.fullName,
    invite_id: invite.id,
    owner_document_url: ownerDocument.url,
    payment_amount: invite.payment.amount,
    payment_currency: invite.payment.currency,
    payment_proof_file_name: paymentProof.file.name,
    payment_proof_file_size: paymentProof.file.size,
    payment_proof_url: paymentProof.url,
    payment_qr_note: invite.payment.qrNote ?? null,
    payment_qr_url: invite.payment.qrUrl ?? null,
    phone: data.phone,
    plate_number: data.plateNumber,
    plate_photo_url: platePhoto.url,
    restaurant_id: invite.restaurant.id,
    ruat_back_url: ruatBack.url,
    ruat_front_url: ruatFront.url,
    ruat_number: data.ruatNumber,
    status: "submitted",
    vehicle_owner_name: data.vehicleOwnerName,
  });

  if (error) {
    const key = error.code === "23505" ? "duplicate" : error.code || "save-failed";
    riderRedirect(data.inviteToken, key);
  }

  redirect(`/riders/${data.inviteToken}?sent=1`);
}
