import {h} from 'preact';
import { useState } from 'preact/hooks';
const FileEncryptor = () => {
  const [file, setFile] = useState(null);
  const [ac, setAC] = useState('');
  const [word, setWord] = useState('');
  function generateAccessCode(length = 4) {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
  
    // Convert array to hex string
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
  }
  
  // Example usage
  const accessCode = generateAccessCode();
  setAC(accessCode)
  console.log('Generated Access Code:', accessCode);
  
  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

 


  const handleEncrypt = async () => {
    if (!file || !ac || !word) {
      alert('Please select a file and provide a valid number and word.');
      return;
    }

    const password = ac + word;
    const key = await deriveKey(password);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await encryptFile(file, key, iv);

    downloadEncryptedFile(encryptedData, file.name + '.enc');
  };

  const deriveKey = async (password) => {
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('some_salt'),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt']
    );
  };

  const encryptFile = async (file, key, iv) => {
    const fileData = await readFileAsArrayBuffer(file);
    return window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      fileData
    );
  };

  const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const downloadEncryptedFile = (data, filename) => {
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      <button onClick={handleEncrypt}>Encrypt File</button>
    </div>
  );
};

export default FileEncryptor;
