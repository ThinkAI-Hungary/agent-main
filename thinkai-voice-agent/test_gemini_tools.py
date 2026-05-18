import os
import asyncio
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

async def test():
    client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
    
    tool_save_client = types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="save_client_data",
                description="Elmenti az ügyfélről kinyert adatokat (név, email, telefon, és egyéb releváns információ pl. autó típusa, elvégzendő munka).",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "name": types.Schema(type=types.Type.STRING, description="Az ügyfél neve, ha megadta."),
                        "email": types.Schema(type=types.Type.STRING, description="Az ügyfél e-mail címe."),
                        "phone": types.Schema(type=types.Type.STRING, description="Az ügyfél telefonszáma.")
                    }
                )
            )
        ]
    )
    
    system_prompt = "Te egy AI asszisztens vagy. MINDEN ESETBEN KÖTELEZŐ MEGHÍVNOD a 'save_client_data' funkciót, ha az ügyfél megadja a nevét, email címét, vagy telefonszámát!"
    contents = [{"role": "user", "parts": [{"text": "Szia, Kovács János vagyok, a telefonszámom 06201234567."}]}]
    
    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            tools=[tool_save_client],
            temperature=0.7
        )
    )
    
    if response.function_calls:
        contents.append(response.candidates[0].content)
        tool_results_parts = []
        for fc in response.function_calls:
            print("Executing", fc.name)
            tool_results_parts.append({
                "functionResponse": {
                    "name": fc.name,
                    "response": {"result": "Sikeres mentés"}
                }
            })
            
        contents.append({
            "role": "user",
            "parts": tool_results_parts
        })
        
        print("Sending tool result to model...")
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                tools=[tool_save_client],
                temperature=0.7
            )
        )
        print("Final response:", response.text)

if __name__ == "__main__":
    asyncio.run(test())
