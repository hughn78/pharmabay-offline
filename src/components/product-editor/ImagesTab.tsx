import { UniversalImageIntake } from "@/components/images/UniversalImageIntake";

interface ImagesTabProps {
  images: Record<string, unknown>[];
  productId: string;
}

export function ImagesTab({ images, productId }: ImagesTabProps) {
  return <UniversalImageIntake images={images} productId={productId} />;
}
