// src/components/FileDropZone.tsx
import { h } from 'preact';
import { useCallback } from 'preact/hooks';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X } from 'lucide-react';

interface FileDropZoneProps {
  onChange: (files: File[]) => void;
  resetKey?: number | string;
  selectedFile?: File | null;
  onRemoveFile?: () => void;
  formatFileSize?: (bytes: number) => string;
}

const FileDropZone = ({ onChange, resetKey, selectedFile, onRemoveFile, formatFileSize }: FileDropZoneProps) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (onChange) {
      onChange(acceptedFiles);
    }
  }, [onChange]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: false,
    noClick: true, // Disable default click behavior, we'll handle it manually
    noKeyboard: false
  });

  const inputProps = getInputProps();
  const rootProps = getRootProps();
  
  const defaultFormatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const fileSizeFormatter = formatFileSize || defaultFormatFileSize;
  
  const handleClick = (e: MouseEvent) => {
    // Don't open dialog if clicking on the remove button
    if ((e.target as HTMLElement)?.closest('button[type="button"]')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    open();
  };
  
  // Extract drag-related props and add our click handler
  const { onClick: _, ...dragProps } = rootProps;
  
  return (
    <div
      {...dragProps}
      onClick={handleClick}
      className={`relative border-2 border-dashed rounded-lg p-8 text-center min-h-[200px] flex flex-col justify-center transition-all ${
        isDragActive
          ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
          : selectedFile
          ? 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer'
          : 'border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 cursor-pointer'
      }`}
    >
      <input {...inputProps} key={resetKey} />
      {selectedFile ? (
        <div className="space-y-4">
          <File className="w-12 h-12 mx-auto text-gray-500 dark:text-gray-400" />
          <div className="space-y-2">
            <p className="font-medium break-all text-gray-900 dark:text-gray-100">
              {selectedFile.name}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {fileSizeFormatter(selectedFile.size)}
            </p>
          </div>
          {isDragActive ? (
            <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
              Drop a new file here to replace
            </p>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Drag 'n' drop a new file here, or click to select
              </p>
              {onRemoveFile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile();
                  }}
                  className="mt-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors flex items-center gap-1.5"
                >
                  <X className="w-4 h-4" />
                  Remove File
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <Upload className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          {isDragActive ? (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 font-medium">Drop the file here ...</p>
          ) : (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Drag 'n' drop a file here, or click to select a file
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default FileDropZone;
