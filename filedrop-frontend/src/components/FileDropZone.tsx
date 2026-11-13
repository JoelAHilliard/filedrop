import { useCallback } from 'preact/hooks';
import { useDropzone } from 'react-dropzone';
import { File, Upload, X } from 'lucide-react';
import { formatFileSize as defaultFormatFileSize } from '@/utils/crypto';
import { cn } from '@/lib/utils';

interface FileDropZoneProps {
  onChange?: (files: File[]) => void;
  resetKey?: string | number;
  selectedFile?: File | null;
  onRemoveFile?: () => void;
  formatFileSize?: (bytes: number) => string;
  disabled?: boolean;
}

const focusRing =
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background';

const FileDropZone = ({ onChange, resetKey, selectedFile, onRemoveFile, formatFileSize, disabled }: FileDropZoneProps) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    onChange?.(acceptedFiles);
  }, [onChange]);

  // The drop target only handles drag events. Picking and removing are real
  // <button>s inside it, so there is no button nested in a role="button".
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled,
  });

  const fileSizeFormatter = formatFileSize || defaultFormatFileSize;

  return (
    <div
      {...getRootProps()}
      className={cn(
        'rounded-lg border-2 border-dashed transition-colors duration-150',
        isDragActive ? 'border-primary bg-accent' : 'border-input',
        selectedFile && !isDragActive && 'border-solid bg-background',
        disabled && 'opacity-60'
      )}
    >
      <input {...getInputProps()} key={resetKey} />
      {selectedFile ? (
        <div className="flex items-center gap-1 p-1.5 sm:p-3">
          <button
            type="button"
            onClick={open}
            disabled={disabled}
            className={cn(
              'flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors duration-150 hover:bg-accent/60 active:bg-accent',
              focusRing
            )}
          >
            <File className="size-8 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block line-clamp-2 font-medium wrap-anywhere">{selectedFile.name}</span>
              <span className="block text-sm text-muted-foreground">
                {fileSizeFormatter(selectedFile.size)}
                <span aria-hidden="true"> · </span>
                {isDragActive ? (
                  'Drop to replace'
                ) : (
                  <>
                    <span className="pointer-coarse:hidden">Click or drop to replace</span>
                    <span className="hidden pointer-coarse:inline">Tap to replace</span>
                  </>
                )}
              </span>
            </span>
          </button>
          {onRemoveFile && (
            <button
              type="button"
              onClick={onRemoveFile}
              disabled={disabled}
              aria-label={`Remove ${selectedFile.name}`}
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,scale] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.96] active:bg-accent',
                focusRing
              )}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={open}
          disabled={disabled}
          className={cn(
            'flex min-h-36 w-full flex-col items-center justify-center gap-1.5 rounded-md p-4 text-center transition-colors duration-150 hover:bg-accent/60 active:bg-accent sm:p-8 pointer-fine:min-h-48',
            focusRing
          )}
        >
          <Upload className="mb-1 size-9 text-muted-foreground pointer-fine:size-11" strokeWidth={1.5} aria-hidden="true" />
          <span className="font-medium">
            {isDragActive ? (
              'Drop the file here'
            ) : (
              <>
                <span className="pointer-coarse:hidden">Drag and drop a file, or click to choose</span>
                <span className="hidden pointer-coarse:inline">Choose a file</span>
              </>
            )}
          </span>
          <span className="text-sm text-muted-foreground">Any file up to 500MB</span>
        </button>
      )}
    </div>
  );
};

export default FileDropZone;
