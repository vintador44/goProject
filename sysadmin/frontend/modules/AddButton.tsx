
const AddButton = ({ onClick }: { onClick?: () => void }) => (
  <button
    onClick={onClick}
    style={{
      position: "absolute",
      right: 16,
      bottom: 16,
      width: 50,
      height: 50,
      borderRadius: "10%",
      border: "none",
      background: "#fff",
      color: "#000000",
      fontSize: 40,
      lineHeight: 1,
      cursor: "pointer",
    }}
  >
    +
  </button>
);

export default AddButton