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
      role="button"
      tabIndex={0}
      aria-label={selectedFile ? `Selected file ${selectedFile.name}. Tap to choose a different file.` : 'Choose a file to upload'}
      className={`relative border-2 border-dashed rounded-lg p-4 sm:p-8 text-center min-h-[160px] sm:min-h-[200px] flex flex-col justify-center transition-all cursor-pointer active:bg-accent/40 ${
        isDragActive
          ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
          : selectedFile
          ? 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
          : 'border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400'
      }`}
    >
      <input {...inputProps} key={resetKey} />
      {selectedFile ? (
        <div className="space-y-3 sm:space-y-4">
          <File className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-gray-500 dark:text-gray-400" />
          <div className="space-y-2">
            <p className="font-medium break-anywhere text-gray-900 dark:text-gray-100">
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
                <span className="hidden sm:inline">Drag 'n' drop a new file here, or click to select</span>
                <span className="sm:hidden">Tap to choose a different file</span>
              </p>
              {onRemoveFile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile();
                  }}
                  className="mt-1 px-4 py-2.5 min-h-[44px] text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors flex items-center gap-1.5"
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
          <Upload className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400 dark:text-gray-500" />
          {isDragActive ? (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 font-medium">Drop the file here ...</p>
          ) : (
            <div className="mt-2 space-y-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                <span className="hidden sm:inline">Drag 'n' drop a file here, or click to select</span>
                <span className="sm:hidden">Tap to choose a file</span>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Any file up to 500MB
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FileDropZone;
