// Test de conexión directa
const http = require('http');

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    console.log('Request options:', requestOptions);

    const req = protocol.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ success: true, data: jsonData, statusCode: res.statusCode });
        } catch (error) {
          resolve({ success: true, data: data, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// Test
makeRequest('http://localhost:8000/health')
  .then(result => {
    console.log('✅ Conexión exitosa!');
    console.log('Status Code:', result.statusCode);
    console.log('Data:', result.data);
  })
  .catch(error => {
    console.log('❌ Error de conexión!');
    console.log('Error:', error.message);
  });
