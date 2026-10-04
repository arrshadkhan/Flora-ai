import streamlit as st
from pathlib import Path

#   css
def load_css():
    css_file = Path("styles/style.css")
    with open(css_file) as f:
        st.markdown(
            f"<style>{f.read()}</style>",
            unsafe_allow_html=True
        )
# Page
st.set_page_config(page_title="Flora AI", page_icon="🌿", layout="wide")
load_css() #css call

#   Sidebar
with st.sidebar:
    st.title("🌿 Flora AI")
    if st.button("＋ New Chat", use_container_width=True):
        st.write("New chat clicked")
    st.divider()
    st.subheader("Recent Chats")
    st.button("What is Artificial Intelligence?", use_container_width=True)
    st.button("Explain Python", use_container_width=True)

    st.button("Machine Learning Basics", use_container_width=True)
    st.divider()
    st.caption("Flora AI")
    st.caption("Generative AI Assistant")

#   Main
st.title("🌿 Flora AI")
if "messages" not in st.session_state:
    st.session_state.messages = []
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.write(message["content"])
st.chat_message('assistant').write('Hii Im Assistant')
prompt = st.chat_input("Ask Flora anything...")
if prompt:
    # Store user message
    st.session_state.messages.append({
        "role": "user",
        "content": prompt
    })
    # Display user message
    with st.chat_message("user"):
        st.write(prompt)
    # Temporary Flora response
    response = "I'm Flora. I received your message."
    # Store Flora response
    st.session_state.messages.append({
        "role": "assistant",
        "content": response
    })
    # Display Flora response
    with st.chat_message("assistant"):
        st.write(response)
