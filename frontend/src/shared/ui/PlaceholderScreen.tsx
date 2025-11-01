import styles from '../../styles/PlaceholderScreen.module.css';

interface PlaceholderScreenProps {
  title: string;
  description: string;
}

export const PlaceholderScreen = ({ title, description }: PlaceholderScreenProps) => {
  return (
    <section className={styles.wrapper}>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
};
