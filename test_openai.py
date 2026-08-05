import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
client = OpenAI()
print(dir(client))
try:
    print(hasattr(client.chat.completions, 'create'))
except Exception as e:
    print(e)
