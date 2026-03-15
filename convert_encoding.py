import os

file_path = r'c:\Users\ADMIN\Downloads\Malanga Welfare\src\lib\mpesa-types.ts'
try:
    with open(file_path, 'rb') as f:
        content = f.read()
    
    # Try to decode utf-16le and encode back to utf-8
    decoded = content.decode('utf-16le')
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(decoded)
    print("Successfully converted to UTF-8")
except Exception as e:
    print(f"Error: {e}")
