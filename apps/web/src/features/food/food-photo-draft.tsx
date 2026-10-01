'use client';

import { useEffect, useRef, useState } from 'react';

export type FoodPhotoPolicy = {
  acceptedMimeTypes: readonly string[];
  maxBytes: number;
};

function formatMimeTypes(mimeTypes: readonly string[]) {
  return mimeTypes
    .map((type) => {
      if (type === 'image/jpeg') return 'JPEG';
      if (type === 'image/png') return 'PNG';
      if (type === 'image/webp') return 'WebP';
      return type;
    })
    .join(' или ');
}

function formatMaxBytes(maxBytes: number) {
  const megabytes = maxBytes / 1_000_000;
  return `до ${Number.isInteger(megabytes) ? megabytes : megabytes.toLocaleString('ru-RU')} МБ`;
}

function validateFile(file: File, policy: FoodPhotoPolicy) {
  const formatLabel = formatMimeTypes(policy.acceptedMimeTypes);
  if (!policy.acceptedMimeTypes.includes(file.type)) {
    return `Выберите изображение в формате ${formatLabel}.`;
  }
  if (file.size > policy.maxBytes) {
    return `Выберите файл размером ${formatMaxBytes(policy.maxBytes)}.`;
  }
  return undefined;
}

/**
 * A local pre-upload boundary. It never uploads an image: the future API flow
 * receives the selected File only after the person explicitly continues.
 */
export function FoodPhotoDraft({
  policy,
  onReady,
}: {
  policy: FoodPhotoPolicy;
  onReady: (file: File) => void;
}) {
  const [file, setFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const formatLabel = formatMimeTypes(policy.acceptedMimeTypes);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function choose(nextFile: File | undefined) {
    if (!nextFile) return;
    const validationError = validateFile(nextFile, policy);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setError(undefined);
  }

  function remove() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(undefined);
    setPreviewUrl(undefined);
    setError(undefined);
    if (inputRef.current) inputRef.current.value = '';
  }

  function rejectUnreadablePreview() {
    setFile(undefined);
    setPreviewUrl(undefined);
    setError('Не удалось открыть это изображение. Выберите другое.');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="food-draft" aria-labelledby="food-photo-draft-title">
      <p className="marathon-kicker">Фото блюда</p>
      <h2 id="food-photo-draft-title">Проверьте фото перед анализом</h2>
      <p className="food-draft-description">
        {formatLabel}, {formatMaxBytes(policy.maxBytes)}. Фото будет отправлено
        только после следующего шага.
      </p>

      <label className="food-file-picker">
        <span>Выбрать фото блюда</span>
        <input
          ref={inputRef}
          type="file"
          accept={policy.acceptedMimeTypes.join(',')}
          onChange={(event) => choose(event.currentTarget.files?.[0])}
        />
      </label>

      {error && (
        <p className="food-draft-error" role="alert">
          {error}
        </p>
      )}

      {!file && !error && (
        <p className="food-draft-pending">Файл пока не отправлен.</p>
      )}

      {file && previewUrl && (
        <div className="food-photo-preview">
          <img
            src={previewUrl}
            alt="Предпросмотр выбранного фото"
            onError={rejectUnreadablePreview}
          />
          <div>
            <p className="food-photo-name">{file.name}</p>
            <p className="food-draft-pending">Файл пока не отправлен.</p>
          </div>
          <button
            type="button"
            className="food-secondary-action"
            onClick={remove}
          >
            Выбрать другое
          </button>
        </div>
      )}

      <button
        type="button"
        className="food-primary-action"
        disabled={!file}
        onClick={() => file && onReady(file)}
      >
        Продолжить
      </button>
    </section>
  );
}
