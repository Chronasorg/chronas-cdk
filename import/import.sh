#!/bin/bash

# Set the table name and the file name
TABLE_NAME="masterdata"
FILE_NAME="metadatas.json"

# Loop through each line of the file
while read -r LINE; do
  # Convert the line to a valid JSON object for DynamoDB
  ITEM=$(echo "$LINE" | jq -c '{_id: ._id, data: .data, wiki: .wiki, subtype: .subtype, year: {N: (.year|tostring)}, score: {N: (.score|tostring)}, type: .type}')  
  
    # Use the AWS CLI to put the item into the table

  aws dynamodb put-item --table-name "$TABLE_NAME" --item "$ITEM"
done < "$FILE_NAME"
