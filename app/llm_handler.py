from groq import Groq
from app.config import config

class LLMHandler:
    def __init__(self):
        self.client = Groq(api_key=config.GROQ_API_KEY)
        self.system_prompt = config.load_system_prompt()
        self.conversation_history = []

    def reset_conversation(self):
        """Reset conversation history"""
        self.conversation_history = []

    async def generate_response(self, user_message: str) -> str:
        """Generate response from LLM"""
        # Add user message to history
        self.conversation_history.append({
            "role": "user",
            "content": user_message
        })

        # Prepare messages with system prompt
        messages = [
                       {"role": "system", "content": self.system_prompt}
                   ] + self.conversation_history

        # Call Groq API
        response = self.client.chat.completions.create(
            model=config.GROQ_MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=2048
        )
        print("Check all response", response)
        # Extract response text
        assistant_message = response.choices[0].message.content

        # Add to history
        self.conversation_history.append({
            "role": "assistant",
            "content": assistant_message
        })

        return assistant_message