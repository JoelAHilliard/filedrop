// src/components/FileDropZone.tsx
import { h } from 'preact';
import { useCallback } from 'preact/hooks';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';

const FileDropZone = ({ onChange }) => {
  const onDrop = useCallback((acceptedFiles) => {
    console.log(acceptedFiles);
    if (onChange) {
      onChange(acceptedFiles);
    }
  }, [onChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false
  });

  return (
    <div
      {...getRootProps()}
      className="relative border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500"
    >
      <input {...getInputProps()} />
      <div>
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        {isDragActive ? (
          <p className="mt-2 text-sm text-gray-600">Drop the file here ...</p>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            Drag 'n' drop a file here, or click to select a file
          </p>
        )}
      </div>
    </div>
  );
};

export default FileDropZone;
