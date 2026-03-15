import sys
file_path = sys.argv[1]
with open(file_path, 'rb') as f:
    content = f.read()
try:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content.decode('utf-16le'))
except Exception as e:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content.decode('utf-8'))
