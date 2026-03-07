CREATE UNIQUE INDEX idx_products_barcode_unique 
ON products (barcode) 
WHERE barcode IS NOT NULL AND barcode != '';