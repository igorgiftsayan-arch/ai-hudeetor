import { DeleteObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { FoodImageDeletionPort } from '../application/food-image-retention.service';

export class S3FoodImageDeletion implements FoodImageDeletionPort {
  constructor(
    private readonly storage: S3Client,
    private readonly bucket: string,
  ) {}
  async deleteObject(key: string): Promise<void> {
    await this.storage.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
